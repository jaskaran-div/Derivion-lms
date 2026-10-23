import { redirect } from "next/navigation";

// Forgot password is turned off: accounts and passwords are issued by the school / administrator
export default function ForgotPasswordPage() {
  redirect("/login");
}
