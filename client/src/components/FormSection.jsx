// The card + icon-headed block every creator-dashboard form is built from
// (new product, edit product, storefront settings). One component so the
// three forms read as a single system instead of three near-identical
// hand-rolled headers with drifting icon colors and spacing.
export default function FormSection({ icon: Icon, title, note, children, style }) {
  return (
    <section className="card card--pad form-section" style={style}>
      <header className="form-section__head">
        <span className="form-section__icon">{Icon && <Icon size={16} />}</span>
        <div>
          <h2 className="form-section__title">{title}</h2>
          {note && <p className="form-section__note">{note}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}
