export { checkCname, checkVerificationTxt, type DomainCheckStatus } from "./dns";
export {
  upsertTrackingDomain,
  verifyTrackingDomain,
  getVerifiedTrackingDomain,
  isApprovedForTls,
} from "./domain-service";
export {
  buildPixelImgTag,
  buildPixelUrl,
  recordEmailOpen,
  TRANSPARENT_GIF,
  TRANSPARENT_GIF_CONTENT_TYPE,
} from "./pixel";
