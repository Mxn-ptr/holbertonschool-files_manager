import { ObjectId } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import mime from 'mime-types';
import Bull from 'bull';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

export default class FilesController {
  static async postUpload(req, res) {
    const fileQueue = new Bull('fileQueue');
    const path = process.env.FOLDER_PATH || 'tmp/files_manager';
    const token = req.header('X-Token') || '';
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fileName = req.body.name;
    if (!fileName) return res.status(400).json({ error: 'Missing name' });

    const fileType = req.body.type;
    if (!fileType || !['folder', 'file', 'image'].includes(fileType)) return res.status(400).json({ error: 'Missing type' });

    const fileData = req.body.data;
    if (!fileData && fileType !== 'folder') return res.status(400).json({ error: 'Missing data' });

    const fileParentId = req.body.parentId || 0;
    if (fileParentId !== 0) {
      const fileParent = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileParentId) });
      if (!fileParent) return res.status(400).json({ error: 'Parent not found' });
      if (fileParent.type !== 'folder') return res.status(400).json({ error: 'Parent is not a folder' });
    }

    const fileIsPublic = req.body.isPublic || false;

    const file = {
      userId: user._id,
      name: fileName,
      type: fileType,
      isPublic: fileIsPublic,
      parentId: fileParentId === 0 ? fileParentId : ObjectId(fileParentId),
    };

    if (fileType === 'folder') {
      await dbClient.db.collection('files').insertOne(file);
      return res.status(201).json({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      });
    }

    const fileUid = uuidv4();
    const decodedData = Buffer.from(fileData, 'base64');
    const filePath = `${path}/${fileUid}`;

    fs.mkdir(path, { recursive: true }, (err) => {
      if (err) console.log(err);
      else {
        fs.writeFile(filePath, decodedData, (err) => {
          if (err) console.log(err);
        });
      }
    });

    file.localPath = filePath;
    await dbClient.db.collection('files').insertOne(file);
    if (file.type === 'image') {
      await fileQueue.add({
        fileId: file._id,
        userId: user._id,
      });
    }
    return res.status(201).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async getShow(req, res) {
    const token = req.header('X-Token') || '';
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token') || '';
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    let match;

    const parent = req.query.parentId || 0;
    if (parent === 0) {
      match = {};
    } else {
      match = { parentId: parent === '0' ? Number(parent) : ObjectId(parent) };
    }
    const page = req.query.page || 0;

    const fileArray = await dbClient.db.collection('files').aggregate([
      { $match: match },
      { $sort: { createdAt: -1 } },
      { $skip: page * 20 },
      { $limit: 20 },
    ]);
    const fileArr = [];

    await fileArray.forEach((file) => {
      const obj = {
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      };
      fileArr.push(obj);
    });

    return res.status(200).send(fileArr);
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token') || '';
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let file = await dbClient.db.collection('files').findOne({ _id: ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Not found' });
    await dbClient.db.collection('files').updateOne({ _id: ObjectId(req.params.id), userId: user._id }, { $set: { isPublic: true } });
    file = await dbClient.db.collection('files').findOne({ _id: ObjectId(req.params.id), userId: user._id }, { projection: { localPath: 0 } });

    return res.status(200).send({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token') || '';
    const id = await redisClient.get(`auth_${token}`);
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    let file = await dbClient.db.collection('files').findOne({ _id: ObjectId(req.params.id), userId: user._id });
    if (!file) return res.status(404).json({ error: 'Not found' });
    await dbClient.db.collection('files').updateOne({ _id: ObjectId(req.params.id), userId: user._id }, { $set: { isPublic: false } });
    file = await dbClient.db.collection('files').findOne({ _id: ObjectId(req.params.id), userId: user._id }, { projection: { localPath: 0 } });

    return res.status(200).send({
      id: file._id,
      userId: file.userId,
      name: file.name,
      type: file.type,
      isPublic: file.isPublic,
      parentId: file.parentId,
    });
  }

  static async getFile(req, res) {
    const fileId = req.params.id || '';
    if (fileId === '') return res.status(404).json({ error: 'Not found' });

    const size = req.query.size || 0;

    const file = await dbClient.db.collection('files').findOne({ _id: ObjectId(fileId) });
    if (!file) return res.status(404).json({ error: 'Not found' });
    let path;

    if (size === 0) {
      path = file.localPath;
    } else {
      path = `${file.localPath}_${size}`;
    }

    if (!file.isPublic) {
      const token = req.header('X-Token') || '';
      const id = await redisClient.get(`auth_${token}`);
      if (!id) return res.status(404).json({ error: 'Not found' });

      const user = await dbClient.db.collection('users').findOne({ _id: ObjectId(id) });
      if (!user || file.userId.toString() !== user._id.toString()) return res.status(404).json({ error: 'Not found' });
    }

    if (file.type === 'folder') return res.status(400).json({ error: 'A folder doesn\'t have content' });

    try {
      const fileData = fs.readFileSync(path);
      const mimeType = mime.contentType(file.name);
      res.setHeader('Content-Type', mimeType);
      return res.status(200).send(fileData);
    } catch (err) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}
