import React from "react";
import ReactDOM from "react-dom/client";
import MusicPage from "@/components/MusicPage";
import "@/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <div className="w-screen h-screen overflow-hidden bg-black text-white p-4">
      <MusicPage />
    </div>
  </React.StrictMode>
);
