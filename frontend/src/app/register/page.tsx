import { redirect } from "next/navigation";

// Self registration is turned off: accounts and passwords are issued by the school / administrator
export default function RegisterPage() {
  redirect("/login");
}
