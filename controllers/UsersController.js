import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

export default class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Missing email' });
    if (!password) return res.status(400).json({ error: 'Missing password' });
    const user = await dbClient.db.collection('users').findOne({ email });
    if (user) return res.status(400).json({ error: 'Already exist' });

    const hashedPassword = sha1(password);

    const newUser = await dbClient.db.collection('users').insertOne({
      email,
      password: hashedPassword,
    });

    return res.status(201).json({ id: newUser.insertedId, email });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token') || '';
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });
    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    return res.status(200).json({ id: user._id, email: user.email });
  }
}
