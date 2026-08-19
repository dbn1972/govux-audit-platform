"use client";
// Segment error boundary — recovers gracefully instead of blanking the app.
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="container py-5" role="alert">
      <div className="gx-card mx-auto" style={{ maxWidth: 560 }}>
        <div className="card-body text-center p-4">
          <i className="bi bi-exclamation-triangle text-warning" style={{ fontSize: 34 }} />
          <h1 className="h4 mt-2 mb-1">Something went wrong</h1>
          <p className="gx-muted">
            We hit an unexpected error loading this page. Your data is safe — please try again.
          </p>
          <div className="d-flex gap-2 justify-content-center mt-3">
            <button className="btn btn-primary" onClick={() => reset()}>Try again</button>
            <a className="btn btn-outline-secondary" href="/dashboard">Go to dashboard</a>
          </div>
        </div>
      </div>
    </div>
  );
}
