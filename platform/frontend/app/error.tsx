"use client";
// Segment error boundary — recovers gracefully instead of blanking the app.
import { useEffect } from "react";
import Icon from "@/components/Icon";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="ux4g-container ux4g-py-l" role="alert">
      <div className="gx-card ux4g-mx-auto" style={{ maxWidth: 560 }}>
        <div className="gx-card-body ux4g-text-center ux4g-p-m">
          <Icon name="exclamation-triangle" size={34} className="ux4g-text-warning" />
          <h1 className="ux4g-heading-xs-strong ux4g-mt-xs ux4g-mb-2xs">Something went wrong</h1>
          <p className="gx-muted">
            We hit an unexpected error loading this page. Your data is safe — please try again.
          </p>
          <div className="ux4g-d-flex ux4g-gap-xs ux4g-jc-center ux4g-mt-s">
            <button className="ux4g-btn ux4g-btn-primary ux4g-btn-md" onClick={() => reset()}>Try again</button>
            <a className="ux4g-btn ux4g-btn-outline-neutral ux4g-btn-md" href="/dashboard">Go to dashboard</a>
          </div>
        </div>
      </div>
    </div>
  );
}
