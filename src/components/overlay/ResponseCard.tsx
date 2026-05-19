import { Clock3 } from "lucide-react";
import type { AIResponseRecord } from "../../types/session";

interface ResponseCardProps {
  response: AIResponseRecord;
}

export function ResponseCard({ response }: ResponseCardProps) {
  return (
    <article className="response-card">
      <div className="response-meta">
        <span>{response.provider}</span>
        <span>{response.model}</span>
        {response.latencyMs ? (
          <span className="latency">
            <Clock3 size={14} /> {response.latencyMs}ms
          </span>
        ) : null}
      </div>
      <p>{response.response}</p>
    </article>
  );
}

