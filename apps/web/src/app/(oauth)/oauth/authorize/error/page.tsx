import { Alert, Card } from "@mail-orbyt/design-system";

export default function AuthorizeErrorPage(): React.ReactElement {
  return (
    <Card>
      <Alert tone="error" title="This connection request can't be completed">
        The authorization request was invalid, expired, or the organisation you selected could no
        longer be verified. Please return to the application you were connecting from and try
        again.
      </Alert>
    </Card>
  );
}
