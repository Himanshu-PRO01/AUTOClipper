import { ProjectPage } from "./pages/ProjectPage.js";
import { NotFound } from "./pages/NotFound.js";
import { useEffect, useState } from "react";

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const onLocationChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", onLocationChange);
    return () => window.removeEventListener("popstate", onLocationChange);
  }, []);

  if (currentPath === "/") {
    return <ProjectPage />;
  }

  return <NotFound />;
}
