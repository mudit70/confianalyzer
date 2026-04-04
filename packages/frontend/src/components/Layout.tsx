import { NavLink, Outlet } from "react-router-dom";
import QueryBar from "./QueryBar";
import { useProjectName } from "../hooks/useProjectName";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: "grid" },
  { to: "/graph", label: "Graph Explorer", icon: "share-2" },
  { to: "/flow", label: "Flow Tracer", icon: "git-branch" },
  { to: "/endpoints", label: "Endpoints", icon: "globe" },
  { to: "/files", label: "Files", icon: "folder" },
  { to: "/blast-radius", label: "Blast Radius", icon: "zap" },
  { to: "/repo-graph", label: "Repo Graph", icon: "layers" },
  { to: "/db-impact", label: "DB Impact", icon: "database" },
] as const;

export default function Layout() {
  const projectName = useProjectName();
  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">ConfiAnalyzer</h1>
        </div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `nav-link ${isActive ? "nav-link--active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="main-area">
        <header className="top-bar">
          <span className="top-bar__project">Project: {projectName}</span>
          <QueryBar />
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
