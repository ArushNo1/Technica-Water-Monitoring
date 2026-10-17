import ReadingsTable from "@/components/ReadingsTable";
import { sampleReadings } from "@/lib/sampleReadings";

export default function Page() {
  return <ReadingsTable readings={sampleReadings} siteName="Saltline · demo site" />;
}
