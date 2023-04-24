import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

export default class AuthController {
  static async getConnect(req, res) {
    const auth = (req.headers.authorization || '').split(' ')[1];

    if (!auth) return res.status(401).json({ error: 'Unauthorized' });

    const decodeAuth = Buffer.from(auth, 'base64').toString('utf-8');
    const [email, password] = decodeAuth.split(':');

    if (!email || !password) return res.status(401).json({ error: 'Unauthorized' });

    const hashedPassword = sha1(password);

    const user = await dbClient.db.collection('users').findOne({
      email,
      password: hashedPassword,
    });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const token = uuidv4();
    const key = `auth_${token}`;
    await redisClient.set(key, user._id.toString(), (24 * 3600));

    return res.status(200).json({ token });
  }

  static async getDisconnet(req, res) {
    const token = req.header('X-Token') || '';
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    redisClient.del(`auth_${token}`);
    return res.status(204).send();
  }
}
