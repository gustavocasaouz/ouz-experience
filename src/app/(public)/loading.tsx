import { LoadingState } from "@/design-system";

export default function Loading() {
  return (
    <div className="container-page py-14">
      <LoadingState lines={4} />
    </div>
  );
}
