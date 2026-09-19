"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="emptyState" role="alert">
      <h1>Race data is unavailable</h1>
      <p>The data provider may be busy. Try again shortly.</p>
      <button onClick={reset}>Retry loading race</button>
    </main>
  );
}
