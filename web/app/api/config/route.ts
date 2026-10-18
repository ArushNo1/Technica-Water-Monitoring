import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const GET = () => NextResponse.json(config);
