import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { Home } from "./components/Home";
import { JobTracker } from "./components/JobTracker";
import { UploadResume } from "./components/UploadResume";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "job-tracker", Component: JobTracker },
      { path: "upload-resume", Component: UploadResume },
    ],
  },
]);
