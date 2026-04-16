import { sequelize } from '../loaders/sequelize.js';

export const tenantQuery = async (tenant, query, options = {}, transaction = null) => {
  if (!/^[a-z0-9_]+$/.test(tenant)) {
    throw new Error('Invalid tenant schema');
  }

  // Shared helper — always runs inside some transaction
  const run = async (t) => {
    await sequelize.query(`SET LOCAL search_path TO "${tenant}"`, { transaction: t });

    const [results, metadata] = await sequelize.query(query, { ...options, transaction: t });

    return options.returnMeta ? { results, metadata } : results;
  };
// console.log(tenant,
// query,
// options);
  // Caller passed a transaction → reuse same connection
  if (transaction) {
    return run(transaction);
  }

  // No transaction → create one (connection is isolated, SET LOCAL is safe)
  return sequelize.transaction(run);
};