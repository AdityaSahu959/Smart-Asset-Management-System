import { useEffect, useState } from "react";
import axios from "../lib/api";
import MainLayout from "../layouts/MainLayout";

function Dashboard() {

  const [labsCount, setLabsCount] = useState(0);

  const [assetsCount, setAssetsCount] = useState(0);

  const [maintenanceCount, setMaintenanceCount] = useState(0);



  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([axios.get('/labs', { signal: controller.signal }), axios.get('/maintenance', { signal: controller.signal })]).then(([labs, maintenance]) => {
      setLabsCount(labs.data.length); setAssetsCount(labs.data.reduce((sum, lab) => sum + Number(lab.asset_count || 0), 0)); setMaintenanceCount(maintenance.data.length); setLoadError('');
    }).catch(error => { if (error.code !== 'ERR_CANCELED') setLoadError(error.response?.data?.message || 'Unable to load dashboard'); });
    return () => controller.abort();
  }, []);

  return (

    <MainLayout>
      {loadError && <p role="alert">{loadError}</p>}

      <div className="space-y-8">

        {/* HEADER */}

        <div className="bg-white p-8 rounded-3xl shadow-md border-l-[10px] border-blue-900">

          <div className="flex items-center gap-6">

            <img
              src="/favicon.svg"
              alt="Asset Management"
              className="w-24 h-24 object-contain"
            />



            <div>

              <h1 className="text-5xl font-extrabold text-blue-900">
                Smart Asset Management
              </h1>

              <p className="text-2xl text-gray-700 mt-3 font-semibold">
                Smart Asset Management System
              </p>

              <p className="text-lg text-gray-500 mt-1">
                Welcome
              </p>

            </div>

          </div>

        </div>



        {/* DASHBOARD */}

        <div className="bg-white p-10 rounded-3xl shadow-md">

          <h1 className="text-4xl font-bold text-blue-800 mb-10">
            Dashboard Overview
          </h1>



          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

            {/* TOTAL LABS */}

            <div className="bg-gradient-to-r from-blue-100 to-blue-200 p-8 rounded-3xl shadow-lg hover:scale-105 transition duration-300">

              <h2 className="text-3xl font-bold text-blue-900">
                Total Labs
              </h2>

              <p className="text-6xl mt-6 font-extrabold text-blue-700">
                {labsCount}
              </p>

            </div>



            {/* TOTAL ASSETS */}

            <div className="bg-gradient-to-r from-green-100 to-green-200 p-8 rounded-3xl shadow-lg hover:scale-105 transition duration-300">

              <h2 className="text-3xl font-bold text-green-900">
                Total Assets
              </h2>

              <p className="text-6xl mt-6 font-extrabold text-green-700">
                {assetsCount}
              </p>

            </div>



            {/* MAINTENANCE */}

            <div className="bg-gradient-to-r from-red-100 to-red-200 p-8 rounded-3xl shadow-lg hover:scale-105 transition duration-300">

              <h2 className="text-3xl font-bold text-red-900">
                Maintenance
              </h2>

              <p className="text-6xl mt-6 font-extrabold text-red-700">
                {maintenanceCount}
              </p>

            </div>

          </div>



          {/* FOOTER */}

          <div className="mt-16 border-t pt-6 text-center">

            <p className="text-gray-700 font-semibold text-lg">
              © 2026 Smart Asset Management | Smart Asset Management System
            </p>



            <p className="text-blue-800 font-bold mt-2">
              Laboratory inventory and maintenance
            </p>

          </div>

        </div>

      </div>

    </MainLayout>
  );
}

export default Dashboard;