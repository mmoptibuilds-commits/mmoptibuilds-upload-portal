import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/v-spinner-6-utils/spinner";

export function RedirectingLoader() {
  return <Card className="redirecting-card" role="status" aria-live="polite"><CardContent className="redirecting-card-content"><Spinner className="size-5" aria-hidden="true" /><div><p>Setting up your workspace</p><span>This may take a few seconds…</span></div></CardContent></Card>;
}

export default RedirectingLoader;
