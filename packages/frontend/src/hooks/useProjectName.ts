import { useState, useEffect } from "react";
import { apiClient } from "../api/client";

/**
 * Returns the first available project name, falling back to "default".
 * Components can use this instead of hardcoding "default".
 */
export function useProjectName(): string {
  const [projectName, setProjectName] = useState("default");

  useEffect(() => {
    apiClient.listProjects().then((projects) => {
      if (projects.length > 0) {
        setProjectName(projects[0].name);
      }
    }).catch(() => {
      // Fall back to "default"
    });
  }, []);

  return projectName;
}
