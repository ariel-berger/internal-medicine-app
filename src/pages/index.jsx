import Layout from "./Layout.jsx";
import Login from "./Login.jsx";
import Dashboard from "./Dashboard";
import AddStudy from "./AddStudy";
import AdminDashboard from "./AdminDashboard";
import MyLibrary from "./MyLibrary";
import DataManagement from "./DataManagement";
import AllStudies from "./AllStudies";
import ProtectedRoute from "../components/ProtectedRoute.jsx";
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';

const PAGES = {
    
    Dashboard: Dashboard,
    
    AddStudy: AddStudy,
    
    AdminDashboard: AdminDashboard,
    
    MyLibrary: MyLibrary,
    
    DataManagement: DataManagement,
    
    AllStudies: AllStudies,
    
}

function _getCurrentPage(url) {
    if (url.endsWith('/')) {
        url = url.slice(0, -1);
    }
    let urlLastPart = url.split('/').pop();
    if (urlLastPart.includes('?')) {
        urlLastPart = urlLastPart.split('?')[0];
    }

    const pageName = Object.keys(PAGES).find(page => page.toLowerCase() === urlLastPart.toLowerCase());
    return pageName || Object.keys(PAGES)[0];
}

// Create a wrapper component that uses useLocation inside the Router context
function PagesContent() {
    const location = useLocation();
    const currentPage = _getCurrentPage(location.pathname);
    
    return (
        <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
                <ProtectedRoute>
                    <Layout currentPageName={currentPage}>
                        <Routes>
                            <Route path="/" element={<Dashboard />} />
                            <Route path="/Dashboard" element={<Dashboard />} />
                            <Route path="/AddStudy" element={<AddStudy />} />
                            <Route path="/AdminDashboard" element={<AdminDashboard />} />
                            <Route path="/MyLibrary" element={<MyLibrary />} />
                            <Route path="/DataManagement" element={<DataManagement />} />
                            <Route path="/AllStudies" element={<AllStudies />} />
                        </Routes>
                    </Layout>
                </ProtectedRoute>
            } />
        </Routes>
    );
}

export default function Pages() {
    return (
        <Router>
            <PagesContent />
        </Router>
    );
}