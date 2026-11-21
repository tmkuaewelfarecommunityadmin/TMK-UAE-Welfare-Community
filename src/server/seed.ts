import { db } from '../db/index.ts';
import { fundAccounts, roles } from '../db/schema.ts';

let seeded = false;

export const INITIAL_OWNER_EMAIL = 'tmkuaewelfarecommunityadmin@gmail.com';

export const SYSTEM_ROLES = [
  { code: 'admin', displayNameEn: 'Administrator', displayNameTa: 'நிர்வாகி' },
  { code: 'committee_member', displayNameEn: 'Committee Member', displayNameTa: 'குழு உறுப்பினர்' },
  { code: 'treasurer', displayNameEn: 'Treasurer', displayNameTa: 'பொருளாளர்' },
  { code: 'member', displayNameEn: 'Member', displayNameTa: 'உறுப்பினர்' },
  { code: 'auditor', displayNameEn: 'Auditor', displayNameTa: 'தணிக்கையாளர்' },
] as const;

export const SYSTEM_ACCOUNTS = [
  {
    accountCode: '1010',
    accountName: 'India Bank Account (INR)',
    accountNameTa: 'இந்தியா வங்கி கணக்கு (INR)',
    accountType: 'asset',
    currencyCode: 'INR',
  },
  {
    accountCode: '1020',
    accountName: 'India Cash in Hand (INR)',
    accountNameTa: 'இந்தியா கை ரொக்கம் (INR)',
    accountType: 'asset',
    currencyCode: 'INR',
  },
  {
    accountCode: '1030',
    accountName: 'UAE Collection Account (AED)',
    accountNameTa: 'UAE வசூல் கணக்கு (AED)',
    accountType: 'asset',
    currencyCode: 'AED',
  },
  {
    accountCode: '4010',
    accountName: 'Contribution Income (INR)',
    accountNameTa: 'சந்தா வருவாய் (INR)',
    accountType: 'income',
    currencyCode: 'INR',
  },
  {
    accountCode: '4020',
    accountName: 'Contribution Income (AED)',
    accountNameTa: 'சந்தா வருவாய் (AED)',
    accountType: 'income',
    currencyCode: 'AED',
  },
  {
    accountCode: '4030',
    accountName: 'Other Inflows & Grants (INR)',
    accountNameTa: 'பிற வரவுகள் மற்றும் நன்கொடை (INR)',
    accountType: 'income',
    currencyCode: 'INR',
  },
  {
    accountCode: '5010',
    accountName: 'Welfare Assistance Expense (INR)',
    accountNameTa: 'நலத்திட்ட உதவி செலவு (INR)',
    accountType: 'expense',
    currencyCode: 'INR',
  },
  {
    accountCode: '5020',
    accountName: 'Welfare Assistance Expense (AED)',
    accountNameTa: 'நலத்திட்ட உதவி செலவு (AED)',
    accountType: 'expense',
    currencyCode: 'AED',
  },
  {
    accountCode: '5030',
    accountName: 'Bank & Remittance Charges (INR)',
    accountNameTa: 'வங்கி மற்றும் பரிமாற்ற கட்டணங்கள் (INR)',
    accountType: 'expense',
    currencyCode: 'INR',
  },
  {
    accountCode: '5040',
    accountName: 'Operational Expense (INR)',
    accountNameTa: 'நிர்வாக செலவுகள் (INR)',
    accountType: 'expense',
    currencyCode: 'INR',
  },
  {
    accountCode: '3010',
    accountName: 'AED FX Settlement Clearing',
    accountNameTa: 'AED நாணய மாற்று கணக்கு',
    accountType: 'clearing',
    currencyCode: 'AED',
  },
] as const;

export async function ensureReferenceData(): Promise<void> {
  if (seeded) return;
  try {
    for (const r of SYSTEM_ROLES) {
      await db.insert(roles).values(r).onConflictDoNothing({ target: roles.code });
    }
    for (const acc of SYSTEM_ACCOUNTS) {
      await db
        .insert(fundAccounts)
        .values({ ...acc, isActive: true })
        .onConflictDoNothing({ target: fundAccounts.accountCode });
    }
    seeded = true;
  } catch (error) {
    console.error('Failed to seed reference data:', error);
    throw new Error('Failed to initialize reference data.', { cause: error });
  }
}
