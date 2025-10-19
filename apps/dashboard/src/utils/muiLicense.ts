import { LicenseInfo } from '@mui/x-data-grid-pro'

// Configure MUI Pro license
export const configureMuiLicense = () => {
  const licenseKey = import.meta.env.VITE_MUI_LICENSE_KEY
  
  if (licenseKey) {
    LicenseInfo.setLicenseKey(licenseKey)
  } else {
    console.warn('MUI Pro license key not found. Please set VITE_MUI_LICENSE_KEY environment variable.')
  }
}
