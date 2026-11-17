import Sidebar from "../components/Sidebar";

function MainLayout({ children }) {

  return (

    <div className="flex flex-col md:flex-row bg-gray-100 min-h-screen">

      <Sidebar />



      <div className="flex-1 min-w-0 p-4 md:p-8">

        {children}

      </div>

    </div>
  );
}

export default MainLayout;