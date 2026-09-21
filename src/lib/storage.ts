import "server-only";

import { getEnv } from "@/lib/env";
import { createStorageOperations } from "@/lib/storage-operations";
import { supabaseServer } from "@/lib/supabase-server";

const { SUPABASE_STORAGE_BUCKET } = getEnv();
const storage = createStorageOperations(supabaseServer.storage.from(SUPABASE_STORAGE_BUCKET));

export const createSignedUploadAuthorization = storage.createSignedUploadAuthorization;
export const verifyStorageObject = storage.verifyStorageObject;
