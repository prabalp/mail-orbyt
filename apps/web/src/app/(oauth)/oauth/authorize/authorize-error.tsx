import { Alert, Card } from "@mail-orbyt/design-system";

export function AuthorizeError({ message }: { message: string }): React.ReactElement {
  return (
    <Card>
      <Alert tone="error" title="Can't continue">
        {message}
      </Alert>
    </Card>
  );
}
