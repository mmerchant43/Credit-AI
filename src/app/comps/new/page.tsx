import DealForm from "@/components/DealForm";

export default function NewCompPage() {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="section-head">
        <h2>Add a Comp</h2>
        <div className="rule" />
      </div>
      <p className="text-sm text-slate-500 mb-4">
        A past underwritten deal. Every value verbatim from its source — leave anything unstated blank.
      </p>
      <DealForm mode="comp" />
    </div>
  );
}
