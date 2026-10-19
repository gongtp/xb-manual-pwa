import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";
import { registerOfflineWorker } from "./offline";

createRoot(document.getElementById("root")!).render(<Home />);
registerOfflineWorker();
