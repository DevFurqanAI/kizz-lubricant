// import { getServerSession } from "next-auth";
// import { redirect } from "next/navigation";
// import { authOptions } from "@/lib/auth";
// import Sidebar from "./sidebar";

// export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
//   const session = await getServerSession(authOptions);
//   if (!session) redirect("/");

//   return (
//     <div className="flex h-screen bg-[#F7F8FA] overflow-hidden">
//       <Sidebar userEmail={session.user?.email ?? ""} />
//       <main className="flex-1 overflow-y-auto">
//         <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</div>
//       </main>
//     </div>
//   );
// }
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Sidebar from "./sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/");

  return (
    <div className="min-h-screen bg-[#F7F8FA]">
      <Sidebar userEmail={session.user?.email ?? ""} />
      <main className="md:ml-[248px] pt-14 pb-24 md:pt-0 md:pb-0 min-h-screen overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto">{children}</div>
      </main>
    </div>
  );
}