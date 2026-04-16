// import { promisePool } from '../loaders/mySQL.js';
import { sequelize } from '../loaders/sequelize.js';
import { QueryTypes } from 'sequelize';
let domainMap = new Map();
export default async (req, res, next) => {
  try {
    let hostName = req.get('host') || null;
    // Temporary stack    
    hostName = hostName.split(':')[0];
    if (hostName === 'localhost') {
      hostName = 'demosaas.sftevolve.com';
    }
    console.log(`converted bypass domain from --${req.get('host')}-- to --${hostName}--`);
    /////////////
    if(domainMap.has(hostName)){
      // console.log('domainMap.get(hostName)', domainMap.get(hostName));
      req.tenant = domainMap.get(hostName);
      return next();
    }
    // console.log(hostName,"hostName")
    //Contenue with the database query to fetch tenant information based on the host name
    const result = await sequelize.query(
      `
        SELECT tmc.*
        FROM public.tenant_models_domain AS tmd
        JOIN public.tenant_models_companymanager AS tmc
          ON tmc.id = tmd.tenant_id
        WHERE tmd.domain = :domain
      `,
      {
        replacements: { domain: hostName },
        type: QueryTypes.SELECT,
      }
    );
    if(result.length === 0){
      return res.status(404).json({ resultMessage: 'Tenant not found for the given host' });
    }
    // console.log('tenantName', result[0].schema_name);
    domainMap.set(hostName, result[0].schema_name);
    req.tenant = result[0].schema_name;
    next();
  } catch (err) {
    console.log('err', err);
    return res.status(500).json({ resultMessage: 'Invalid host' });
  }
};