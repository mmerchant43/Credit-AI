import EntryModeToggle from "@/components/EntryModeToggle";

export default function NewCompPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="section-head">
        <h2>Add a Comp</h2>
        <div className="rule" />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        A past underwritten deal. Upload its OM or enter it manually — either way, every value is
        verbatim from its source and anything unstated stays blank.
      </p>
      <EntryModeToggle mode="comp" />
    </div>
  );
}
