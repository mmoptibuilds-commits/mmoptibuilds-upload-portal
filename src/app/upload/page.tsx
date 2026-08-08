import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { UploadWorkspace } from "@/components/upload-workspace";
export default async function UploadPage() { const user = await currentUser(); if (!user) redirect("/login"); return <AppShell user={user}><UploadWorkspace username={user.username} /></AppShell>; }
