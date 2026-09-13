export function Panel({
  title,
  kicker,
  actions,
  className = "",
  children,
}: {
  title: string;
  kicker?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      <header className="panelHeader">
        <div>
          {kicker && <div className="panelKicker">{kicker}</div>}
          <h2>{title}</h2>
        </div>
        {actions && <div className="panelActions">{actions}</div>}
      </header>
      <div className="panelBody">{children}</div>
    </section>
  );
}
