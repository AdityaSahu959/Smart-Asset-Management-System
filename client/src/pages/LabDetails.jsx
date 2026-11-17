import { canManage } from '../lib/permissions';
import { useEffect, useState, useRef, useCallback } from "react";

import axios from "../lib/api";

import * as XLSX from "xlsx";

import { saveAs } from "file-saver";

import jsPDF from "jspdf";


import QRCode from "qrcode";

import { useParams, useNavigate } from "react-router-dom";

import { QRCodeCanvas } from "qrcode.react";

import MainLayout from "../layouts/MainLayout";

function LabDetails() {

  const { id } = useParams();

  const navigate = useNavigate();

  const resultsRef = useRef(null);

  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);

  const [labInfo, setLabInfo] = useState({});

  const [searchTerm, setSearchTerm] = useState("");

  const [statusFilter] = useState("");

  const [brandFilter] = useState("");

  const [conditionFilter] = useState("");

  const [editingAsset, setEditingAsset] = useState(null);
const [editData, setEditData] = useState({
  purchase_date: "",
  asset_name: "",
    category_id: "", warranty_expiry: "", assigned_to: "",
  brand: "",
  model: "",
  processor: "",
  ram: "",
  storage: "",
  asset_condition: "",
  asset_status: "",
  extra_details: [],
});

  const [formData, setFormData] = useState({
    asset_name: "",
    category_id: "", warranty_expiry: "", assigned_to: "",
    asset_code: "",
    brand: "",
    model: "",
    serial_number: "",
    processor: "",
    ram: "",
    storage: "",
    purchase_date: "",
    asset_condition: "",
    asset_status: "",
  });
  const [extraFields, setExtraFields] = useState([]);
   const [showSettings, setShowSettings] = useState(false);

const [visibleFields, setVisibleFields] = useState({});




  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const fetchAssets = useCallback((signal) => Promise.all([axios.get('/assets/' + id, { signal }), axios.get('/labs/' + id, { signal }), axios.get('/categories', { signal })]).then(([assetResponse, labResponse, categoryResponse]) => {
    setCategories(categoryResponse.data); setAssets(assetResponse.data); const selectedLab = labResponse.data;
    const dynamicFields = { code: true, room: true, department: true, description: true };
    const rawExtra = typeof selectedLab.extra_details === 'string' ? JSON.parse(selectedLab.extra_details) : selectedLab.extra_details || [];
    const extra = rawExtra.map(item => ({ label: item.label || item.key, value: item.value }));
    setLabInfo({ ...selectedLab, extra_details: JSON.stringify(extra) });
    extra.forEach(item => { dynamicFields[item.label || item.key] = true; }); setVisibleFields(dynamicFields); setLoadError('');
  }).catch(error => { if (error.code !== 'ERR_CANCELED') setLoadError(error.response?.data?.message || 'Unable to load assets'); }), [id]);

    const toggleField = (field) => {

  setVisibleFields({
    ...visibleFields,
    [field]: !visibleFields[field],
  });
};


  useEffect(() => { const controller = new AbortController(); fetchAssets(controller.signal); return () => controller.abort(); }, [fetchAssets]);





  // HANDLE INPUT
  const handleChange = (e) => {

    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

const addExtraField = () => {

  setExtraFields([
    ...extraFields,
    {
  label: "",
  value: "",
},
  ]);
};





const handleExtraChange = (
  index,
  key,
  value
) => {

  const updatedFields = [...extraFields];

  updatedFields[index][key] = value;

  setExtraFields(updatedFields);
};



  // CREATE ASSET
  const handleSubmit = async (e) => {

    e.preventDefault();
    if (saving) return;
    setSaving(true);

    try {

    await axios.post(

  "/assets",

  {
    ...formData,
    lab_id: id,
    extra_details: extraFields,
  }

);

      alert("Asset Added Successfully");

      fetchAssets();
      
     


      setFormData({
        asset_name: "",
    category_id: "", warranty_expiry: "", assigned_to: "",
        asset_code: "",
        brand: "",
        model: "",
        serial_number: "",
        processor: "",
        ram: "",
        storage: "",
        purchase_date: "",
        asset_condition: "",
        asset_status: "",
      });

    } catch (error) {

      setLoadError(error.response?.data?.message || "Request failed");

      alert("Failed To Add Asset");
    } finally { setSaving(false); }
  };





  // DELETE ASSET
  const handleDelete = async (assetId) => {

    const confirmDelete = window.confirm(
      "Are you sure you want to delete this asset?"
    );

    if (!confirmDelete) return;

    try {

      await axios.delete(
        `/assets/${assetId}`
      );

      alert("Asset Deleted Successfully");

      fetchAssets();

    } catch (error) {

      setLoadError(error.response?.data?.message || "Request failed");

      alert("Failed To Delete Asset");
    }
  };





  // OPEN EDIT FORM
  // OPEN EDIT FORM
// OPEN EDIT FORM
const handleEditClick = (asset) => {

  setEditingAsset(asset);

  let parsedExtraDetails;

  try {

    parsedExtraDetails =
      typeof asset.extra_details === "string"
        ? JSON.parse(asset.extra_details)
        : asset.extra_details || [];

  } catch {

    parsedExtraDetails = [];

  }

  setEditData({

    asset_name: asset.asset_name || "",
    category_id: asset.category_id || "", warranty_expiry: asset.warranty_expiry || "", assigned_to: asset.assigned_to || "", purchase_date: asset.purchase_date || "",

    brand: asset.brand || "",

    model: asset.model || "",

    processor: asset.processor || "",

    ram: asset.ram || "",

    storage: asset.storage || "",

    asset_condition: asset.asset_condition || "",

    asset_status: asset.asset_status || "",

    extra_details: parsedExtraDetails,

  });

};





  // HANDLE EDIT INPUT
  function handleEditChange(e) {

    setEditData({
      ...editData,
      [e.target.name]: e.target.value,
    });
  }





  // UPDATE ASSET
  const handleUpdateAsset = async () => {

    try {

      await axios.put(

  `/assets/${editingAsset.id}`,

  {
    ...editData,
    extra_details: editData?.extra_details,
  }

);

      alert("Asset Updated Successfully");

      setEditingAsset(null);

      fetchAssets();

    } catch (error) {

      setLoadError(error.response?.data?.message || "Request failed");

      alert("Failed To Update Asset");
    }
  };





  // FILTERED ASSETS
  const filteredAssets = assets.filter((asset) => {

    const search = searchTerm.toLowerCase();

    const matchesSearch =

      asset.asset_name?.toLowerCase().includes(search) ||

      asset.asset_code?.toLowerCase().includes(search) ||

      asset.brand?.toLowerCase().includes(search) ||

      asset.model?.toLowerCase().includes(search) ||

      asset.processor?.toLowerCase().includes(search);




    const matchesStatus = statusFilter
      ? asset.asset_status?.toLowerCase() === statusFilter.toLowerCase()
      : true;




    const matchesBrand = brandFilter
      ? asset.brand?.toLowerCase() === brandFilter.toLowerCase()
      : true;




    const matchesCondition = conditionFilter
      ? asset.asset_condition?.toLowerCase() === conditionFilter.toLowerCase()
      : true;




    return (
      matchesSearch &&
      matchesStatus &&
      matchesBrand &&
      matchesCondition
    );
  });





  // EXPORT EXCEL
  const exportToExcel = () => {

    const exportData = filteredAssets.map((asset) => ({

      Lab_Name: labInfo.lab_name,

      Lab_Code: labInfo.lab_code,

      Department: labInfo.department,

      Room_Number: labInfo.room_number,

      Asset_Name: asset.asset_name,

      Asset_Code: asset.asset_code,

      Processor: asset.processor,

      RAM: asset.ram,

      Storage: asset.storage,

      Brand: asset.brand,

      Model: asset.model,

      Status: asset.asset_status,

      Condition: asset.asset_condition,

    }));




    const worksheet = XLSX.utils.json_to_sheet(exportData);

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Assets"
    );




    const excelBuffer = XLSX.write(
      workbook,
      {
        bookType: "xlsx",
        type: "array",
      }
    );




    const data = new Blob(
      [excelBuffer],
      {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;charset=UTF-8",
      }
    );




    saveAs(
      data,
      `${labInfo.lab_name || "Lab"}_Assets_Report.xlsx`
    );
  };





  // DOWNLOAD QR PDF
  const downloadQRPDF = async () => {

    const doc = new jsPDF();




    doc.setFontSize(22);

    doc.text(
      "Lab Asset QR Report",
      14,
      20
    );




    // LAB DETAILS
    doc.setFontSize(12);

    doc.text(
      `Lab Name: ${labInfo.lab_name || ""}`,
      14,
      30
    );

    doc.text(
      `Lab Code: ${labInfo.lab_code || ""}`,
      14,
      38
    );

    doc.text(
      `Department: ${labInfo.department || ""}`,
      14,
      46
    );

    doc.text(
      `Room Number: ${labInfo.room_number || ""}`,
      14,
      54
    );




    let yPosition = 70;




    for (const asset of filteredAssets) {

      if (yPosition > 240) {

        doc.addPage();

        yPosition = 20;
      }




      doc.setFontSize(16);

      doc.text(
        `Asset: ${asset.asset_name}`,
        14,
        yPosition
      );




      doc.setFontSize(11);

      doc.text(
        `Code: ${asset.asset_code || "N/A"}`,
        14,
        yPosition + 10
      );

      doc.text(
        `Brand: ${asset.brand || "N/A"}`,
        14,
        yPosition + 18
      );

      doc.text(
        `Model: ${asset.model || "N/A"}`,
        14,
        yPosition + 26
      );

      doc.text(
        `Processor: ${asset.processor || "N/A"}`,
        14,
        yPosition + 34
      );

      doc.text(
        `RAM: ${asset.ram || "N/A"}`,
        14,
        yPosition + 42
      );

      doc.text(
        `Storage: ${asset.storage || "N/A"}`,
        14,
        yPosition + 50
      );

      doc.text(
        `Status: ${asset.asset_status || "N/A"}`,
        14,
        yPosition + 58
      );




      // QR LINK
      const qrData =
        `${window.location.origin}/asset/${asset.id}`;





      const qrImage =
        await QRCode.toDataURL(qrData);





      doc.addImage(
        qrImage,
        "PNG",
        140,
        yPosition,
        45,
        45
      );





      doc.line(
        10,
        yPosition + 70,
        200,
        yPosition + 70
      );




      yPosition += 85;
    }




    doc.save(
      `${labInfo.lab_name || "Lab"}_Asset_QR_Report.pdf`
    );
  };





  return (
    <MainLayout>
      {loadError && <p role="alert">{loadError}</p>}

      <h1 className="text-3xl font-bold mb-8">
        {labInfo.lab_name} Assets Management
      </h1>





      {/* LAB INFO */}
       
       <div className="flex justify-end mb-4">

  <button
    onClick={() => setShowSettings(!showSettings)}
    className="bg-gray-800 text-white px-5 py-3 rounded-lg"
  >
    Open Lab Settings
  </button>

</div>





{
  showSettings && (

    <div className="bg-white p-5 rounded-xl shadow mb-5">

      <h2 className="text-2xl font-bold mb-5">
        Lab Visibility Settings
      </h2>

      <div className="space-y-4">

        {

          Object.keys(visibleFields).map((field) => (

            <div
              key={field}
              className="flex justify-between items-center border-b pb-3"
            >

              <span className="capitalize font-medium">
                Show {field}
              </span>

              <button
                onClick={() => toggleField(field)}
                className={`px-4 py-2 rounded-lg text-white ${
                  visibleFields[field]
                    ? "bg-green-600"
                    : "bg-red-600"
                }`}
              >
                {visibleFields[field]
                  ? "ON"
                  : "OFF"}
              </button>

            </div>

          ))

        }

      </div>

    </div>

  )
}

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">

  <h2 className="text-2xl font-bold text-blue-700">
    {labInfo.lab_name}
  </h2>





  {visibleFields.code && (

    <p className="mt-2">

      <strong>Lab Code:</strong>
      {" "}

      {labInfo.lab_code}

    </p>

  )}






  {visibleFields.department && (

    <p>

      <strong>Department:</strong>
      {" "}

      {labInfo.department}

    </p>

  )}






  {visibleFields.room && (

    <p>

      <strong>Room:</strong>
      {" "}

      {labInfo.room_number}

    </p>

  )}






  {visibleFields.description && (

    <p className="mt-2 text-gray-600">

      {labInfo.description}

    </p>

  )}




  {

    labInfo.extra_details &&

    (() => {

      try {

        const parsedDetails =
          JSON.parse(labInfo.extra_details);





        return parsedDetails.map(
          (item, index) => {

            return (

              visibleFields[item.label] && (

                <p key={index}>

                  <strong>
                    {item.label}:
                  </strong>

                  {" "}

                  {item.value}

                </p>

              )

            );

          }
        );

      } catch { return null;
      }

    })()

  }
  
   </div>



      {/* EXPORT BUTTONS */}

      <div className="flex justify-end gap-4 mb-6">

        <button
          onClick={exportToExcel}
          className="bg-green-700 text-white px-6 py-3 rounded-lg"
        >
          Export Excel
        </button>





        <button
          onClick={downloadQRPDF}
          className="bg-red-700 text-white px-6 py-3 rounded-lg"
        >
          Download QR PDF
        </button>

      </div>





      {/* SEARCH */}

      <div className="bg-white p-6 rounded-xl shadow-md mb-6">

        <div className="flex gap-4">

          <input
            type="text"
            placeholder="Search Asset..."
            className="border p-4 rounded-lg w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />

          <button
            onClick={() => {

              setTimeout(() => {

                resultsRef.current?.scrollIntoView({
                  behavior: "smooth",
                });

              }, 100);

            }}
            className="bg-blue-700 text-white px-6 rounded-lg"
          >
            Search
          </button>

        </div>





        <div className="mt-4">

          {searchTerm !== "" && (

            filteredAssets.length > 0 ? (

              <p className="text-green-700 font-semibold">

                {filteredAssets.length} Asset Found

              </p>

            ) : (

              <p className="text-red-600 font-semibold">

                No Asset Found

              </p>

            )

          )}

        </div>

      </div>





      {/* ADD ASSET FORM */}

      {canManage() && <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow-md mb-10"
      >

        <div className="grid grid-cols-3 gap-4">
<label>Category<select name="category_id" className="border p-3 rounded-lg w-full" value={formData.category_id || ""} onChange={handleChange}><option value="">Uncategorized</option>{categories.map(category => <option key={category.id} value={category.id}>{category.category_name}</option>)}</select></label><label>Warranty expiry<input type="date" name="warranty_expiry" className="border p-3 rounded-lg w-full" value={formData.warranty_expiry || ""} onChange={handleChange} /></label><label>Custodian label<input name="assigned_to" className="border p-3 rounded-lg w-full" maxLength={100} value={formData.assigned_to || ""} onChange={handleChange} /></label>

          <input
            type="text"
            name="asset_name"
            placeholder="Asset Name"
            className="border p-3 rounded-lg"
            value={formData.asset_name}
            onChange={handleChange}
          />

          <input
            type="text"
            name="asset_code"
            placeholder="Asset Code"
            className="border p-3 rounded-lg"
            value={formData.asset_code}
            onChange={handleChange}
          />

          <input
            type="text"
            name="processor"
            placeholder="Processor"
            className="border p-3 rounded-lg"
            value={formData.processor}
            onChange={handleChange}
          />

          <input
            type="text"
            name="brand"
            placeholder="Brand"
            className="border p-3 rounded-lg"
            value={formData.brand}
            onChange={handleChange}
          />

          <input
            type="text"
            name="model"
            placeholder="Model"
            className="border p-3 rounded-lg"
            value={formData.model}
            onChange={handleChange}
          />

          <input
            type="text"
            name="serial_number"
            placeholder="Serial Number"
            className="border p-3 rounded-lg"
            value={formData.serial_number}
            onChange={handleChange}
          />

          <input
            type="text"
            name="ram"
            placeholder="RAM"
            className="border p-3 rounded-lg"
            value={formData.ram}
            onChange={handleChange}
          />

          <input
            type="text"
            name="storage"
            placeholder="Storage"
            className="border p-3 rounded-lg"
            value={formData.storage}
            onChange={handleChange}
          />

          <input
            type="date"
            name="purchase_date"
            className="border p-3 rounded-lg"
            value={formData.purchase_date}
            onChange={handleChange}
          />

          <select aria-label="Asset condition" name="asset_condition" className="border p-3 rounded-lg" value={formData.asset_condition || "Good"} onChange={handleChange}>{["New","Good","Fair","Poor","Damaged"].map(value => <option key={value}>{value}</option>)}</select>

          <select aria-label="Asset status" name="asset_status" className="border p-3 rounded-lg" value={formData.asset_status || "Available"} onChange={handleChange}>{["Available","In Use","Under Maintenance","Retired"].map(value => <option key={value}>{value}</option>)}</select>

        </div>
       <button
  type="button"
  onClick={addExtraField}
  className="bg-gray-700 text-white px-5 py-3 rounded-lg"
>
  Add More Details
</button>





<div className="grid grid-cols-2 gap-4 mt-5">

  {

    extraFields.map((field, index) => (

      <div key={index} className="contents">

        <input
          type="text"
          placeholder="Field Name"
          value={field.label}
          onChange={(e) =>
            handleExtraChange(
              index,
              "label",
              e.target.value
            )
          }
          className="border p-4 rounded-xl"
        />





        <input
          type="text"
          placeholder="Field Value"
          value={field.value}
          onChange={(e) =>
            handleExtraChange(
              index,
              "value",
              e.target.value
            )
          }
          className="border p-4 rounded-xl"
        />

      </div>

    ))

  }

</div>
        <button disabled={saving}
          type="submit"
          className="bg-green-700 text-white px-6 py-3 rounded-lg mt-4"
        >
          Add Asset
        </button>

      </form>}





      {/* ASSET CARDS */}

      <div ref={resultsRef}></div>

      <div className="grid grid-cols-3 gap-6">

        {filteredAssets.map((asset) => (

          <div
            key={asset.id}
            onClick={() => navigate(`/asset/${asset.id}`)}
            className="bg-white p-6 rounded-xl shadow-md cursor-pointer hover:scale-105 transition"
          >

            <h2 className="text-2xl font-bold text-green-700">
              {asset.asset_name}
            </h2>

            <p className="mt-2">
              <strong>Code:</strong> {asset.asset_code}
            </p>

            <p>
              <strong>Processor:</strong> {asset.processor}
            </p>

            <p>
              <strong>RAM:</strong> {asset.ram}
            </p>

            <p>
              <strong>Storage:</strong> {asset.storage}
            </p>

            <p>
              <strong>Brand:</strong> {asset.brand}
            </p>

            <p>
              <strong>Model:</strong> {asset.model}
            </p>

            <p>
              <strong>Status:</strong> {asset.asset_status}
            </p>

            
  {
  (
    typeof asset.extra_details === "string"
      ? JSON.parse(asset.extra_details)
      : asset.extra_details || []
  ).map((item, index) => (

    <p key={index}>
      <strong>{item.label || item.key}:</strong> {item.value}
    </p>

  ))
}



            {/* BUTTONS */}

            <div className="mt-4 flex gap-3">

              <button disabled={!canManage()}
                onClick={(e) => {

                  e.stopPropagation();

                  handleEditClick(asset);
                }}
                className="bg-yellow-500 text-white px-4 py-2 rounded-lg"
              >
                Edit
              </button>





              <button disabled={!canManage()}
                onClick={(e) => {

                  e.stopPropagation();

                  handleDelete(asset.id);
                }}
                className="bg-red-600 text-white px-4 py-2 rounded-lg"
              >
                Delete
              </button>

            </div>





            {/* QR */}

            <div className="mt-6 flex justify-center">

              <QRCodeCanvas
                value={`${window.location.origin}/asset/${asset.id}`}
                size={120}
              />

            </div>

          </div>

        ))}

      </div>
     {/* EDIT MODAL */}

{editingAsset && (

  <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">

    <div className="bg-white p-8 rounded-xl w-[700px]">

      <h2 className="text-3xl font-bold mb-6 text-yellow-600">
        Edit Asset
      </h2>





      <div className="grid grid-cols-2 gap-4">
<label>Category<select name="category_id" className="border p-3 rounded-lg w-full" value={editData.category_id || ""} onChange={handleEditChange}><option value="">Uncategorized</option>{categories.map(category => <option key={category.id} value={category.id}>{category.category_name}</option>)}</select></label><label>Warranty expiry<input type="date" name="warranty_expiry" className="border p-3 rounded-lg w-full" value={editData.warranty_expiry || ""} onChange={handleEditChange} /></label><label>Custodian label<input name="assigned_to" className="border p-3 rounded-lg w-full" maxLength={100} value={editData.assigned_to || ""} onChange={handleEditChange} /></label><label>Purchase date<input type="date" name="purchase_date" className="border p-3 rounded-lg w-full" value={editData.purchase_date || ""} onChange={handleEditChange} /></label>

        <input
          type="text"
          name="asset_name"
          placeholder="Asset Name"
          className="border p-3 rounded-lg"
          value={editData?.asset_name}
          onChange={handleEditChange}
        />
        




        <input
          type="text"
          name="brand"
          placeholder="Brand"
          className="border p-3 rounded-lg"
          value={editData?.brand}
          onChange={handleEditChange}
        />





        <input
          type="text"
          name="model"
          placeholder="Model"
          className="border p-3 rounded-lg"
         value={editData?.model}
          onChange={handleEditChange}
        />





        <input
          type="text"
          name="processor"
          placeholder="Processor"
          className="border p-3 rounded-lg"
          value={editData?.processor}
          onChange={handleEditChange}
        />





        <input
          type="text"
          name="ram"
          placeholder="RAM"
          className="border p-3 rounded-lg"
          value={editData?.ram}
          onChange={handleEditChange}
        />





        <input
          type="text"
          name="storage"
          placeholder="Storage"
          className="border p-3 rounded-lg"
          value={editData?.storage}
          onChange={handleEditChange}
        />





        <select aria-label="Asset condition" name="asset_condition" className="border p-3 rounded-lg" value={editData.asset_condition || "Good"} onChange={handleEditChange}>{["New","Good","Fair","Poor","Damaged"].map(value => <option key={value}>{value}</option>)}</select>





        <select aria-label="Asset status" name="asset_status" className="border p-3 rounded-lg" value={editData.asset_status || "Available"} onChange={handleEditChange}>{["Available","In Use","Under Maintenance","Retired"].map(value => <option key={value}>{value}</option>)}</select>

        <h2 className="text-xl font-bold mt-6 mb-4">
  Extra Details
</h2>

{
  (editData?.extra_details || []).map((item, index) => (

  <div
    key={index}
    className="flex gap-2 mb-3"
  >

    <input
      type="text"
      placeholder="Field Name"
      value={item.label || ""}
      onChange={(e) => {

        const updated = [...editData.extra_details];

        updated[index].label = e.target.value;

        setEditData({
          ...editData,
          extra_details: updated,
        });

      }}
      className="border p-2 rounded w-full"
    />

    <input
      type="text"
      placeholder="Value"
      value={item.value || ""}
      onChange={(e) => {

        const updated = [...editData.extra_details];

        updated[index].value = e.target.value;

        setEditData({
          ...editData,
          extra_details: updated,
        });

      }}
      className="border p-2 rounded w-full"
    />

    <button
      type="button"
      onClick={() => {

        const updated =
          editData.extra_details.filter(
            (_, i) => i !== index
          );

        setEditData({
          ...editData,
          extra_details: updated,
        });

      }}
      className="bg-red-600 text-white px-4 rounded-lg"
    >
      Delete
    </button>

  </div>
))}

<button
  type="button"
  onClick={() => {

    setEditData({
      ...editData,
      extra_details: [
        ...(editData.extra_details || []),
        {
          label: "",
          value: "",
        },
      ],
    });

  }}
  className="bg-blue-900 text-white px-6 py-3 rounded-lg"
>
  Add More Details
</button>

      </div>





      <div className="flex gap-4 mt-8">

        <button
          onClick={handleUpdateAsset}
          className="bg-green-700 text-white px-6 py-3 rounded-lg"
        >
          Update Asset
        </button>





        <button
          onClick={() => setEditingAsset(null)}
          className="bg-gray-500 text-white px-6 py-3 rounded-lg"
        >
          Cancel
        </button>

      </div>

    </div>

  </div>

)}
    </MainLayout>
  );

}

export default LabDetails;