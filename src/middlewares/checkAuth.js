// import { User, Token } from '../../../models/index.js';
import { promisePool } from '../loaders/mySQL.js';

export default async (req, res, next) => {
  let token = req.header('Authorization');
  if (!token) return res.status(401).json({'resultMessage': 'No token provided'});
  if (token.includes('Bearer')) token = req.header('Authorization').replace('Bearer ', '');
  try {
    console.log('token ', token);

    const [rows] = await promisePool.execute(
        'SELECT id, token, jti, user_id, expires_at FROM token_blacklist_outstandingtoken WHERE token = ? LIMIT 1',
        [token]
    );

    console.log(rows);
    
    // req.user = verify(token, jwtSecretKey);
    // if (!Types.ObjectId.isValid(req.user._id))
    //   return res.status(400).json(errorHelper('00007', req));

    // const exists = await User.exists({ _id: req.user._id, isVerified: true, isActivated: true })
    //   .catch((err) => {
    //     return res.status(500).json(errorHelper('00008', req, err.message));
    //   });

    // if (!exists) return res.status(400).json(errorHelper('00009', req));

    // const tokenExists = await Token.exists({ userId: req.user._id, status: true })
    //   .catch((err) => {
    //     return res.status(500).json(errorHelper('00010', req, err.message));
    //   });

    // if (!tokenExists) return res.status(401).json(errorHelper('00011', req));

    next();
  } catch (err) {
    return res.status(401).json({'resultMessage': 'Invalid token'});
  }
};
