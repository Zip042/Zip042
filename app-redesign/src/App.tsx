import { BrowserRouter, Routes, Route } from "react-router";
import Layout from "@/components/Layout";
import Home from "@/pages/Home";
import Analyze from "@/pages/Analyze";
import AnalyzeDocuments from "@/pages/AnalyzeDocuments";
import AnalyzeDetails from "@/pages/AnalyzeDetails";
import AnalyzeReview from "@/pages/AnalyzeReview";
import AnalyzeResult from "@/pages/AnalyzeResult";
import Checklist from "@/pages/Checklist";
import Glossary from "@/pages/Glossary";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/analyze" element={<Analyze />} />
          <Route path="/analyze/documents" element={<AnalyzeDocuments />} />
          <Route path="/analyze/details" element={<AnalyzeDetails />} />
          <Route path="/analyze/review" element={<AnalyzeReview />} />
          <Route path="/analyze/result" element={<AnalyzeResult />} />
          <Route path="/checklist" element={<Checklist />} />
          <Route path="/glossary" element={<Glossary />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
