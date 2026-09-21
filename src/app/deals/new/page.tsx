import EntryModeToggle from "@/components/EntryModeToggle";

export default function NewDealAnalysisPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="section-head">
        <h2>New Deal Analysis</h2>
        <div className="rule" />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Upload the subject deal&apos;s OM — the facts are read out of it, the five-filter screen runs
        against the comp database, and the deal is added automatically. Or enter it manually.
      </p>
      <EntryModeToggle mode="deal" />
    </div>
  );
}
