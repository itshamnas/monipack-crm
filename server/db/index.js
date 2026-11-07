import pool from './pool.js';
import { normalizeOmanPhone } from './utils.js';
import * as users from './users.js';
import * as branches from './branches.js';
import * as salesmen from './salesmen.js';
import * as categories from './categories.js';
import * as stages from './stages.js';
import * as products from './products.js';
import * as leads from './leads.js';
import * as quotations from './quotations.js';
import * as targets from './targets.js';
import * as activities from './activities.js';
import * as analytics from './analytics.js';
import * as settings from './settings.js';
import * as stageHistory from './stageHistory.js';
import * as auditLog from './auditLog.js';

const db = {
  pool,
  normalizeOmanPhone,

  // Users
  getUsers: users.getUsers,
  getUserByEmail: users.getUserByEmail,
  getUserById: users.getUserById,
  getUserAuthState: users.getUserAuthState,
  getPublicUserById: users.getPublicUserById,
  createUser: users.createUser,
  updateUser: users.updateUser,
  deactivateUser: users.deactivateUser,
  deleteUser: users.deleteUser,
  updateUserPassword: users.updateUserPassword,
  recordLogin: users.recordLogin,
  countActiveSuperAdmins: users.countActiveSuperAdmins,
  initUsers: users.initUsers,

  // Branches
  getBranches: branches.getBranches,
  getBranchById: branches.getBranchById,
  getBranchByLegacyId: branches.getBranchByLegacyId,
  addBranch: branches.addBranch,
  updateBranch: branches.updateBranch,
  deleteBranch: branches.deleteBranch,

  // Salesmen
  getSalesmen: salesmen.getSalesmen,
  getSalesmanById: salesmen.getSalesmanById,
  findOrCreateSalesman: salesmen.findOrCreateSalesman,
  createSalesman: salesmen.createSalesman,
  updateSalesman: salesmen.updateSalesman,
  deleteSalesman: salesmen.deleteSalesman,

  // Categories
  getCategories: categories.getCategories,
  addCategory: categories.addCategory,
  deleteCategory: categories.deleteCategory,

  // Pipeline Stages
  getPipelineStages: stages.getPipelineStages,
  addPipelineStage: stages.addPipelineStage,
  deletePipelineStage: stages.deletePipelineStage,

  // Products
  getProducts: products.getProducts,
  createProduct: products.createProduct,
  updateProduct: products.updateProduct,
  deleteProduct: products.deleteProduct,
  bulkDeleteProducts: products.bulkDeleteProducts,
  bulkUpsertProducts: products.bulkUpsertProducts,

  // Leads
  getLeads: leads.getLeads,
  getLeadById: leads.getLeadById,
  createLead: leads.createLead,
  updateLead: leads.updateLead,
  deleteLead: leads.deleteLead,
  purgeAllLeads: leads.purgeAllLeads,
  bulkUpsertLeads: leads.bulkUpsertLeads,

  // Quotations
  getQuotations: quotations.getQuotations,
  getQuotationById: quotations.getQuotationById,
  createQuotation: quotations.createQuotation,
  updateQuotation: quotations.updateQuotation,
  deleteQuotation: quotations.deleteQuotation,
  purgeAllQuotations: quotations.purgeAllQuotations,

  // Activities
  addActivity: activities.addActivity,
  getActivities: activities.getActivities,
  getLeadTimeline: activities.getLeadTimeline,
  getTargets: targets.getTargets,
  setTargets: targets.setTargets,

  // Analytics
  getAnalytics: analytics.getAnalytics,

  // Settings
  getSettings: settings.getSettings,
  updateSettings: settings.updateSettings,

  // Stage History
  recordStageChange: stageHistory.recordStageChange,
  getStageHistory: stageHistory.getStageHistory,

  // Audit Log
  addAuditEntry: auditLog.addAuditEntry,
  getAuditLogs: auditLog.getAuditLogs,
};

export default db;
