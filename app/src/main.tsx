import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initSession } from "./lib/session";
import "./styles/index.css";

// API 클라이언트에 토큰 공급자를 연결한다. 첫 요청 전에 한 번만 하면 된다.
initSession();

createRoot(document.getElementById("root")!).render(<App />);
