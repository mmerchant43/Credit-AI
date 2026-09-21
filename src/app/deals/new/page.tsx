import DealForm from "@/components/DealForm";

export default function NewDealAnalysisPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="section-head">
        <h2>New Deal Analysis</h2>
        <div className="rule" />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        Enter the subject deal from its OM. Saving runs the five-filter screen against the comp
        database, saves the analysis, and adds the deal to the database automatically.
      </p>
      <DealForm mode="deal" />
    </div>
  );
}
