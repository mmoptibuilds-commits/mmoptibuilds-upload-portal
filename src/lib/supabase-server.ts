import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getEnv } from "@/lib/env";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getEnv();

export const supabaseServer = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
