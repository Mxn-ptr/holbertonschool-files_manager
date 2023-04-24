import { MongoClient } from 'mongodb';

const host = process.env.DB_HOST || 'localhost';
const port = process.env.DB_PORT || 27017;
const database = process.env.DB_DATABASE || 'files_manager';

class DBClient {
  constructor() {
    MongoClient.connect(`mongodb://${host}:${port}`, { useUnifiedTopology: true }, (err, client) => {
      this.db = client.db(database);
    });
  }

  isAlive() {
    return !!this.db;
  }

  async nbUsers() {
    const usersCount = this.db.collection('users').countDocuments();
    return usersCount;
  }

  async nbFiles() {
    const filesCount = this.db.collection('files').countDocuments();
    return filesCount;
  }
}

const dbClient = new DBClient();
export default dbClient;
