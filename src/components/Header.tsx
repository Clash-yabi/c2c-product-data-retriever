import { Rocket } from "lucide-react";

interface HeaderProps {
  version: string;
}

export function Header({ version }: HeaderProps) {
  return (
    <>
      <h1 className="card__title">
        <Rocket size={60} color="#7F9FD5" /> C2C Scraper {version}
      </h1>
      <p className="subtitle">
        Automated product intelligence for Cradle to Cradle Certified products.
      </p>
    </>
  );
}
