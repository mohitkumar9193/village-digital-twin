import mongoose from 'mongoose';

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    await mongoose.disconnect();
    throw new Error('MongoDB must use a replica set or Atlas: complaint transactions are required.');
  }
}
