import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Labs from './pages/Labs';
import LabDetails from './pages/LabDetails';
import AssetDetails from './pages/AssetDetails';
import ForgotPassword from './pages/ForgotPassword';
import Categories from './pages/Categories';
import Audit from './pages/Audit';
import Users from './pages/Users';
import Maintenance from './pages/Maintenance';
import ResetPassword from './pages/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';
export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route element={<ProtectedRoute />}>
      <Route path="/maintenance" element={<Maintenance />} />
      <Route path="/categories" element={<Categories />} />
      <Route path="/audit" element={<Audit />} />
      <Route path="/users" element={<Users />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/labs" element={<Labs />} />
      <Route path="/labs/:id" element={<LabDetails />} />
      <Route path="/asset/:id" element={<AssetDetails />} />
    </Route>
  </Routes></BrowserRouter>;
}
