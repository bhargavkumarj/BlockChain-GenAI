import type { Metadata } from "next";
import { Suspense } from "react";
import { DraftStudio } from "@/components/draft/draft-studio";

export const metadata: Metadata = {
  title: "Draft an agreement",
  description: "Describe a deal in plain words; Scribe drafts milestones, prices and checkable acceptance criteria.",
};

export default function DraftPage() {
  return (
    <Suspense>
      <DraftStudio />
    </Suspense>
  );
}
