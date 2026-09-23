import { Layout } from "../components/Layout.js";
import "./NotFound.css";

export function NotFound() {
  return (
    <Layout>
      <div className="not-found-container">
        <h1>404</h1>
        <h2>Page Not Found</h2>
        <p>The page you are looking for doesn't exist or has been moved.</p>
        <a href="/" className="home-button">
          Go Home
        </a>
      </div>
    </Layout>
  );
}
