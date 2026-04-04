import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Dashboard from "./components/Dashboard";
import GraphExplorer from "./components/GraphExplorer";
import FlowTracer from "./components/FlowTracer";
import EndpointList from "./components/EndpointList";
import FileTree from "./components/FileTree";
import BlastRadius from "./components/BlastRadius";
import RepoGraph from "./components/RepoGraph";
import DbImpact from "./components/DbImpact";
import ProjectWizard from "./components/ProjectWizard";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="new-project" element={<ProjectWizard />} />
        <Route path="graph" element={<GraphExplorer />} />
        <Route path="flow" element={<FlowTracer />} />
        <Route path="endpoints" element={<EndpointList />} />
        <Route path="files" element={<FileTree />} />
        <Route path="blast-radius" element={<BlastRadius />} />
        <Route path="repo-graph" element={<RepoGraph />} />
        <Route path="db-impact" element={<DbImpact />} />
      </Route>
    </Routes>
  );
}
