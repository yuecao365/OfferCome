import { getProfileRefreshStatus } from "@/lib/candidate-profile/state";

export async function GET() {
  return Response.json(await getProfileRefreshStatus());
}
