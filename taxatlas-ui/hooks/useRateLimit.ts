import { useEffect, useState } from "react";
import { onRateLimit, rateLimit, type RateLimitInfo } from "@/taxatlas-ui/lib/api";

export function useRateLimit(): RateLimitInfo {
  const [info, setInfo] = useState<RateLimitInfo>(rateLimit);
  useEffect(() => onRateLimit(setInfo), []);
  return info;
}
