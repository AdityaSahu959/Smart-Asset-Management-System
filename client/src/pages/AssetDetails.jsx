import { useEffect, useState, useCallback } from "react";

import axios from "../lib/api";

import { useParams } from "react-router-dom";

import { QRCodeCanvas } from "qrcode.react";

import jsPDF from "jspdf";

import ReliabilityWidget from '../components/ReliabilityWidget';
import MaintenancePanel from '../components/MaintenancePanel';
import { canManage } from '../lib/permissions';
import MainLayout from "../layouts/MainLayout";

function AssetDetails() {

  const { id } = useParams();

  const [asset, setAsset] = useState(null);

  const [revision, setRevision] = useState(0);
  const changed = useCallback(() => setRevision(value => value + 1), []);
  const [loadError, setLoadError] = useState('');
  const fetchAsset = useCallback((signal) => axios.get('/assets/details/' + id, { signal }).then(({data}) => { setAsset(data); setLoadError(''); }).catch(error => { if (error.code !== 'ERR_CANCELED') setLoadError(error.response?.data?.message || 'Unable to load asset'); }), [id]);
  useEffect(() => { const controller = new AbortController(); fetchAsset(controller.signal); return () => controller.abort(); }, [fetchAsset]);
  const retire = async () => { if (!window.confirm('Retire this asset and retain its repair history?')) return; try { await axios.post('/assets/' + id + '/retire'); await fetchAsset(); changed(); } catch(error) { setLoadError(error.response?.data?.message || 'Retirement failed'); } };

  // DOWNLOAD PDF
  const downloadAssetPDF = () => {

    const doc = new jsPDF();





    doc.setFontSize(22);

    doc.text(
      "Asset Details Report",
      20,
      20
    );





    doc.setFontSize(14);

    doc.text(
      `Asset Name: ${asset.asset_name}`,
      20,
      40
    );

    doc.text(
      `Asset Code: ${asset.asset_code || "N/A"}`,
      20,
      52
    );

    doc.text(
      `Processor: ${asset.processor || "N/A"}`,
      20,
      64
    );

    doc.text(
      `RAM: ${asset.ram || "N/A"}`,
      20,
      76
    );

    doc.text(
      `Storage: ${asset.storage || "N/A"}`,
      20,
      88
    );

    doc.text(
      `Brand: ${asset.brand || "N/A"}`,
      20,
      100
    );

    doc.text(
      `Model: ${asset.model || "N/A"}`,
      20,
      112
    );

    doc.text(
      `Serial Number: ${asset.serial_number || "N/A"}`,
      20,
      124
    );

    doc.text(
      `Condition: ${asset.asset_condition || "N/A"}`,
      20,
      136
    );

    doc.text(
      `Status: ${asset.asset_status || "N/A"}`,
      20,
      148
    );

    doc.text(
      `Purchase Date: ${asset.purchase_date || "N/A"}`,
      20,
      160
    );





    doc.save(
      `${asset.asset_name}_Details.pdf`
    );
  };





  // LOADING
  if (!asset) {

    return (
      <MainLayout>
      {loadError && <p role="alert">{loadError}</p>}
        <h1 className="text-3xl font-bold">
          {loadError || "Loading..."}
        </h1>
      </MainLayout>
    );
  }






  return (
    <MainLayout>

      {loadError && <p role="alert">{loadError}</p>}
      {/* ASSET DETAILS CARD */}

      <div className="bg-white p-10 rounded-xl shadow-md">

        <h1 className="text-4xl font-bold text-green-700 mb-8">
          {asset.asset_name}
        </h1>





        {/* QR CODE */}

        <div className="flex justify-center mb-10">

          <QRCodeCanvas
            value={`${window.location.origin}/asset/${asset.id}`}
            size={220}
          />

        </div>





        {/* ASSET DETAILS */}

        <div className="grid grid-cols-2 gap-6 text-lg">

          <p>
            <strong>Asset Code:</strong> {asset.asset_code}
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
            <strong>Serial Number:</strong> {asset.serial_number}
          </p>

          <p>
            <strong>Status:</strong> {asset.asset_status}
          </p>

          <p>
            <strong>Condition:</strong> {asset.asset_condition}
          </p>

          <p>
            <strong>Purchase Date:</strong> {asset.purchase_date || "Not recorded"}
          </p>

        </div>





        <div className="mt-6 space-y-2"><p><strong>Category:</strong> {asset.category_name || "Uncategorized"}</p><p><strong>Warranty expiry:</strong> {asset.warranty_expiry || "Not recorded"}</p><p><strong>Custodian label:</strong> {asset.assigned_to || "Not recorded"}</p></div>
        {/* DOWNLOAD PDF */}

        <button
          onClick={downloadAssetPDF}
          className="bg-red-700 text-white px-6 py-3 rounded-lg mt-10 hover:bg-red-800"
        >
          Download Asset PDF
        </button>
        {canManage() && !asset.retired_at && <button className="border px-5 py-3 rounded-lg ml-4" onClick={retire}>Retire asset</button>}

      </div>






      <ReliabilityWidget assetId={asset.id} revision={revision} />
      <MaintenancePanel onChanged={changed} assetId={asset.id} retired={Boolean(asset.retired_at) || asset.asset_status === 'Retired'} />

    </MainLayout>
  );
}

export default AssetDetails;