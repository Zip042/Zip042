import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "@/components/Layout";
import RequireAuth from "@/components/RequireAuth";
import { FlowProvider } from "@/state/flow";
import { AuthProvider } from "@/state/auth";
import Home from "@/pages/Home";
import Login from "@/pages/Login";
import Analyze from "@/pages/Analyze";
import AnalyzeDocuments from "@/pages/AnalyzeDocuments";
import AnalyzeReview from "@/pages/AnalyzeReview";
import AnalyzeResult from "@/pages/AnalyzeResult";
import AnalyzeProsCons from "@/pages/AnalyzeProsCons";
import Checklist from "@/pages/Checklist";
import Glossary from "@/pages/Glossary";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FlowProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Home />} />
              <Route path="/login" element={<Login />} />
              <Route path="/checklist" element={<Checklist />} />
              <Route path="/glossary" element={<Glossary />} />

              {/* 검사 흐름은 로그인이 있어야 한다 — 사용자 소유 데이터를 다룬다. */}
              <Route element={<RequireAuth />}>
                <Route path="/analyze" element={<Analyze />} />
                <Route path="/analyze/documents" element={<AnalyzeDocuments />} />
                <Route path="/analyze/review" element={<AnalyzeReview />} />
                <Route path="/analyze/result" element={<AnalyzeResult />} />
                <Route path="/analyze/pros-cons" element={<AnalyzeProsCons />} />
              </Route>
            </Route>
          </Routes>
        </FlowProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
