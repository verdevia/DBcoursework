const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = express();
const port = 3000;

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Hol9axf6!',
  database: 'onlinepharmacy'
});

app.use(require('express-session')({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true
}));

db.connect((err) => {
  if (err) {
    console.error('Помилка підключення до бази даних:', err.stack);
    return;
  }
  console.log('Підключено до бази даних MySQL');
});

app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(session({
  secret: 'secret_key',
  resave: false,
  saveUninitialized: true
}));

app.use(express.static(path.join(__dirname, 'html')));

app.post('/register', (req, res) => {
  const { username, pwd, mail } = req.body;

  db.query('SELECT * FROM users WHERE username = ?', [username], (err, results) => {
    if (err) {
      return res.redirect('/reg.html?error=Помилка запиту до бази даних');
    }

    if (results.length > 0) {
      return res.redirect('/reg.html?error=Користувач з таким логіном вже існує');
    }

    db.query('INSERT INTO users (username, password, email) VALUES (?, ?, ?)', [username, pwd, mail], (err, result) => {
      if (err) {
        return res.redirect('/reg.html?error=Помилка при реєстрації користувача');
      }

      req.session.user = { username, email: mail };

      res.redirect('/main.html');
    });
  });
});

app.get('/api/categories', (req, res) => {
  const query = 'SELECT category_id, category_name FROM categories'; 
  db.query(query, (err, results) => {
      if (err) {
          console.error('Error fetching categories:', err);
          return res.status(500).json({ message: 'Error fetching categories' });
      }
      res.json(results); 
  });
});


app.get('/api/all-orders', async (req, res) => {
  try {

    if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Користувач не авторизований' });
    }

    const query = `
      SELECT 
        o.order_id, 
        o.user_id, 
        JSON_ARRAYAGG(
          JSON_OBJECT(
            'name', p.name,
            'quantity', oi.quantity
          )
        ) AS products
      FROM orders o
      INNER JOIN order_items oi ON o.order_id = oi.order_id
      INNER JOIN products p ON oi.product_id = p.product_id
      GROUP BY o.order_id, o.user_id
      ORDER BY o.order_id DESC;
    `;

    db.query(query, (err, results) => {
      if (err) {
        console.error('Помилка при отриманні всіх замовлень:', err);
        return res.status(500).json({ success: false, message: 'Не вдалося отримати всі замовлення' });
      }

      const ordersWithUsername = results.map(order => {
        return new Promise((resolve, reject) => {
          const userQuery = 'SELECT username FROM users WHERE user_id = ?';
          db.query(userQuery, [order.user_id], (err, userResults) => {
            if (err) {
              reject('Не вдалося отримати ім\'я користувача');
            } else {
              order.username = userResults[0] ? userResults[0].username : 'Невідомий';
              resolve(order);
            }
          });
        });
      });

      Promise.all(ordersWithUsername)
        .then(orders => {
          res.status(200).json(orders);
        })
        .catch(error => {
          console.error('Помилка при обробці замовлень:', error);
          res.status(500).json({ success: false, message: 'Помилка при обробці замовлень' });
        });
    });
  } catch (error) {
    console.error('Помилка при отриманні всіх замовлень:', error);
    res.status(500).json({ success: false, message: 'Не вдалося отримати всі замовлення' });
  }
});

app.post('/api/search-products', (req, res) => {
  const { name, categories } = req.body;
  let query = 'SELECT * FROM products WHERE 1=1';
  let queryParams = [];

  if (name) {
      query += ' AND name LIKE ?';
      queryParams.push(`%${name}%`);
  }

  if (categories && categories.length > 0) {
      query += ' AND category_id IN (?)';
      queryParams.push(categories);
  }

  db.query(query, queryParams, (err, results) => {
      if (err) {
          console.error('Error searching products:', err);
          return res.status(500).json({ message: 'Error searching products' });
      }
      res.json(results);
  });
});

app.post('/login', (req, res) => {
  const { username, pwd } = req.body;

  db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, pwd], (err, results) => {
    if (err) {
      return res.redirect('/ent.html?error=Помилка запиту до бази даних');
    }

    if (results.length === 0) {
      return res.redirect('/ent.html?error=Неправильний логін або пароль');
    }

    req.session.user = { username: results[0].username, email: results[0].email };

    res.redirect('/main.html');
  });
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.redirect('/main.html');
    }
    res.redirect('/main.html');
  });
});

app.get('/session-status', (req, res) => {
  if (req.session.user) {
      return res.json({
          isLoggedIn: true,
          username: req.session.user.username,
          role: req.session.user.role 
      });
  } else {
      return res.json({
          isLoggedIn: false
      });
  }
});

app.get('/user-data', (req, res) => {
  if (!req.session.user) {
    return res.status(403).json({ message: 'Немає доступу' });
  }

  const query = 'SELECT username, email, phone_number, address, role FROM users WHERE username = ?';
  db.query(query, [req.session.user.username], (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Помилка на сервері' });
    }
    const user = results[0];
    res.json(user);
  });
});

app.post('/update-user', (req, res) => {
    if (!req.session.user) {
      return res.status(403).json({ message: 'Немає доступу' });
    }
  
    const { phone_number, address } = req.body;
  
    console.log('Отримано дані для оновлення:', phone_number, address);
  
    if (!phone_number || !address) {
      return res.status(400).json({ message: 'Не всі поля заповнені' });
    }
  
    const query = 'UPDATE users SET phone_number = ?, address = ? WHERE username = ?';
    db.query(query, [phone_number, address, req.session.user.username], (err, results) => {
      if (err) {
        console.error('Помилка запиту до бази даних:', err); 
        return res.status(500).json({ message: 'Помилка на сервері' });
      }
  
      if (results.affectedRows > 0) {
        res.json({ message: 'Дані оновлено' });
      } else {
        res.status(400).json({ message: 'Нічого не змінено, можливо, дані вже актуальні' });
      }
    });
  });

  app.post('/api/add-to-cart', (req, res) => {
    const { product_id, quantity } = req.body;

    if (!req.session.user) {
        return res.status(401).json({ success: false, message: 'Будь ласка, увійдіть у систему перед додаванням товару до кошика' });
    }

    const username = req.session.user.username; 

    const query = 'SELECT user_id FROM users WHERE username = ?';
    db.query(query, [username], (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, message: 'Помилка при отриманні user_id' });
        }

        if (results.length > 0) {
            const user_id = results[0].user_id;

            const checkStockQuery = 'SELECT quantity_in_stock FROM products WHERE product_id = ?';
            db.query(checkStockQuery, [product_id], (err, stockResults) => {
                if (err) {
                    return res.status(500).json({ success: false, message: 'Помилка при перевірці наявності товару' });
                }

                if (stockResults.length === 0) {
                    return res.status(404).json({ success: false, message: 'Товар не знайдений' });
                }

                const availableQuantity = stockResults[0].quantity_in_stock;

                if (quantity > availableQuantity) {
                    return res.status(400).json({ success: false, message: 'Запитувана кількість товару перевищує наявну' });
                }

                const checkQuery = 'SELECT * FROM cart WHERE user_id = ? AND product_id = ?';
                db.query(checkQuery, [user_id, product_id], (err, checkResults) => {
                    if (err) {
                        return res.status(500).json({ success: false, message: 'Помилка при перевірці кошика' });
                    }

                    if (checkResults.length > 0) {
                        const newQuantity = checkResults[0].quantity + parseInt(quantity, 10); 
                        if (newQuantity > availableQuantity) {
                            return res.status(400).json({ success: false, message: 'Запитувана кількість товару перевищує наявну' });
                        }

                        const updateQuery = 'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?';
                        db.query(updateQuery, [newQuantity, user_id, product_id], (err) => {
                            if (err) {
                                return res.status(500).json({ success: false, message: 'Помилка при оновленні кошика' });
                            }
                            res.json({ success: true, message: 'Кількість товару в кошику оновлено' });
                        });
                    } else {
                        const insertQuery = 'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)';
                        db.query(insertQuery, [user_id, product_id, quantity], (err) => {
                            if (err) {
                                return res.status(500).json({ success: false, message: 'Помилка при додаванні товару до кошика' });
                            }
                            res.json({ success: true, message: 'Товар додано до кошика' });
                        });
                    }
                });
            });
        } else {
            res.status(404).json({ success: false, message: 'Користувач не знайдений' });
        }
    });
});

app.get('/api/products', (req, res) => {
  db.query('SELECT * FROM Products', (err, results) => {
    if (err) {
      return res.status(500).json({ message: 'Помилка запиту до бази даних' });
    }
    res.json(results);
  });
});

app.get('/main', (req, res) => {
  res.sendFile(path.join(__dirname, 'html', 'main.html'));
});

app.get('/api/cart', (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ message: 'Будь ласка, увійдіть у систему, щоб переглянути кошик' });
  }

  const username = req.session.user.username;

  const query = `
      SELECT c.product_id, c.quantity, p.name, p.price, p.quantity_in_stock 
      FROM cart c
      JOIN products p ON c.product_id = p.product_id
      WHERE c.user_id = (SELECT user_id FROM users WHERE username = ?)
  `;
  db.query(query, [username], (err, results) => {
      if (err) {
          return res.status(500).json({ message: 'Помилка запиту до бази даних' });
      }
      res.json(results);
  });
});

app.post('/api/remove-from-cart', (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ message: 'Будь ласка, увійдіть у систему, щоб видаляти товари з кошика' });
  }

  const { product_id, quantity } = req.body;
  const username = req.session.user.username;

  const checkQuery = 'SELECT quantity FROM cart WHERE user_id = (SELECT user_id FROM users WHERE username = ?) AND product_id = ?';
  db.query(checkQuery, [username, product_id], (err, results) => {
      if (err) {
          return res.status(500).json({ message: 'Помилка при перевірці кошика' });
      }

      if (results.length === 0) {
          return res.status(404).json({ message: 'Товар не знайдений у кошику' });
      }

      const currentQuantity = results[0].quantity;

      if (currentQuantity <= quantity) {
          const deleteQuery = 'DELETE FROM cart WHERE user_id = (SELECT user_id FROM users WHERE username = ?) AND product_id = ?';
          db.query(deleteQuery, [username, product_id], (err) => {
              if (err) {
                  return res.status(500).json({ message: 'Помилка при видаленні товару з кошика' });
              }
              res.json({ success: true, message: 'Товар видалено з кошика' });
          });
      } else {
          const newQuantity = currentQuantity - quantity;
          const updateQuery = 'UPDATE cart SET quantity = ? WHERE user_id = (SELECT user_id FROM users WHERE username = ?) AND product_id = ?';
          db.query(updateQuery, [newQuantity, username, product_id], (err) => {
              if (err) {
                  return res.status(500).json({ message: 'Помилка при оновленні кошика' });
              }
              res.json({ success: true, message: 'Кількість товару в кошику оновлено' });
          });
      }
  });
});

app.post('/api/place-order', (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ success: false, message: 'Будь ласка, увійдіть у систему, щоб оформити замовлення' });
  }

  const username = req.session.user.username;

  db.beginTransaction((err) => {
      if (err) {
          return res.status(500).json({ success: false, message: 'Помилка при створенні транзакції' });
      }

      const getUserIdQuery = 'SELECT user_id FROM users WHERE username = ?';
      db.query(getUserIdQuery, [username], (err, userResults) => {
          if (err || userResults.length === 0) {
              db.rollback(() => {
                  res.status(500).json({ success: false, message: 'Помилка при отриманні user_id або користувач не знайдений' });
              });
              return;
          }

          const user_id = userResults[0].user_id;

          const createOrderQuery = 'INSERT INTO orders (user_id) VALUES (?)';
          db.query(createOrderQuery, [user_id], (err, orderResults) => {
              if (err) {
                  db.rollback(() => {
                      res.status(500).json({ success: false, message: 'Помилка при створенні замовлення' });
                  });
                  return;
              }

              const order_id = orderResults.insertId;

              const getCartQuery = 'SELECT product_id, quantity FROM cart WHERE user_id = ?';
              db.query(getCartQuery, [user_id], (err, cartResults) => {
                  if (err || cartResults.length === 0) {
                      db.rollback(() => {
                          res.status(500).json({ success: false, message: 'Помилка при отриманні даних кошика або кошик порожній' });
                      });
                      return;
                  }

                  const insertOrderItemsQuery = 'INSERT INTO order_items (order_id, product_id, quantity) VALUES ?';
                  const orderItemsData = cartResults.map(item => [order_id, item.product_id, item.quantity]);

                  db.query(insertOrderItemsQuery, [orderItemsData], (err) => {
                      if (err) {
                          db.rollback(() => {
                              res.status(500).json({ success: false, message: 'Помилка при перенесенні товарів у замовлення' });
                          });
                          return;
                      }

                      const updateProductQuantitiesQuery = `
                          UPDATE products p
                          JOIN order_items oi ON p.product_id = oi.product_id
                          SET p.quantity_in_stock = p.quantity_in_stock - oi.quantity
                          WHERE oi.order_id = ?
                      `;
                      db.query(updateProductQuantitiesQuery, [order_id], (err) => {
                          if (err) {
                              db.rollback(() => {
                                  res.status(500).json({ success: false, message: 'Помилка при оновленні кількості товарів' });
                              });
                              return;
                          }

                          const clearCartQuery = 'DELETE FROM cart WHERE user_id = ?';
                          db.query(clearCartQuery, [user_id], (err) => {
                              if (err) {
                                  db.rollback(() => {
                                      res.status(500).json({ success: false, message: 'Помилка при очищенні кошика' });
                                  });
                                  return;
                              }

                              db.commit((err) => {
                                  if (err) {
                                      db.rollback(() => {
                                          res.status(500).json({ success: false, message: 'Помилка при завершенні транзакції' });
                                      });
                                      return;
                                  }

                                  res.json({ success: true, message: 'Замовлення успішно оформлено' });
                              });
                          });
                      });
                  });
              });
          });
      });
  });
});



app.get('/api/user-orders', (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ message: 'Будь ласка, увійдіть у систему, щоб переглянути замовлення.' });
  }

  const username = req.session.user.username;

  const getUserIdQuery = 'SELECT user_id FROM users WHERE username = ?';
  db.query(getUserIdQuery, [username], (err, userResults) => {
      if (err || userResults.length === 0) {
          return res.status(500).json({ message: 'Помилка при отриманні даних користувача.' });
      }

      const userId = userResults[0].user_id;

      const getOrdersQuery = `
          SELECT o.order_id, oi.product_id, oi.quantity, p.name
          FROM orders o
          JOIN order_items oi ON o.order_id = oi.order_id
          JOIN products p ON oi.product_id = p.product_id
          WHERE o.user_id = ?
      `;
      db.query(getOrdersQuery, [userId], (err, ordersResults) => {
          if (err) {
              return res.status(500).json({ message: 'Помилка при отриманні замовлень.' });
          }

          const ordersMap = {};

          ordersResults.forEach(item => {
              if (!ordersMap[item.order_id]) {
                  ordersMap[item.order_id] = {
                      order_id: item.order_id,
                      order_date: item.order_date,
                      products: [],
                      total: 0
                  };
              }
              ordersMap[item.order_id].products.push({
                  product_id: item.product_id,
                  name: item.name,
                  quantity: item.quantity,
                  price: item.price_per_item
              });
              ordersMap[item.order_id].total += item.quantity * item.price_per_item;
          });

          const ordersArray = Object.values(ordersMap);
          res.json(ordersArray);
      });
  });
});

app.get('/api/user-orders', (req, res) => {
  if (!req.session.user) {
      return res.status(401).json({ message: 'Будь ласка, увійдіть у систему, щоб переглянути замовлення.' });
  }

  const username = req.session.user.username;

  const getUserIdQuery = 'SELECT user_id FROM users WHERE username = ?';
  db.query(getUserIdQuery, [username], (err, userResults) => {
      if (err || userResults.length === 0) {
          return res.status(500).json({ message: 'Помилка при отриманні даних користувача.' });
      }

      const userId = userResults[0].user_id;

      const getOrdersQuery = `
          SELECT o.order_id, oi.product_id, oi.quantity, p.name
          FROM orders o
          JOIN order_items oi ON o.order_id = oi.order_id
          JOIN products p ON oi.product_id = p.product_id
          WHERE o.user_id = ?
          ORDER BY o.order_id
      `;
      db.query(getOrdersQuery, [userId], (err, ordersResults) => {
          if (err) {
              return res.status(500).json({ message: 'Помилка при отриманні замовлень.' });
          }

          const ordersMap = {};

          ordersResults.forEach(item => {
              if (!ordersMap[item.order_id]) {
                  ordersMap[item.order_id] = {
                      order_id: item.order_id,
                      products: []
                  };
              }
              ordersMap[item.order_id].products.push({
                  product_id: item.product_id,
                  name: item.name,
                  quantity: item.quantity
              });
          });

          const ordersArray = Object.values(ordersMap);
          res.json(ordersArray);
      });
  });
});

app.delete('/api/order/:orderId', (req, res) => {
  const orderId = req.params.orderId; 

  db.query('SELECT product_id, quantity FROM order_items WHERE order_id = ?', [orderId], (err, items) => {
    if (err) {
      console.error('Помилка при отриманні товарів для замовлення:', err);
      return res.status(500).json({ success: false, message: 'Помилка при отриманні товарів для замовлення.' });
    }

    if (items.length === 0) {
      return res.status(404).json({ success: false, message: 'Замовлення не знайдено.' });
    }

    let updateProductQueries = [];
    items.forEach(item => {
      updateProductQueries.push(new Promise((resolve, reject) => {
        db.query('UPDATE products SET quantity_in_stock = quantity_in_stock + ? WHERE product_id = ?', [item.quantity, item.product_id], (err) => {
          if (err) {
            reject('Помилка при оновленні кількості товару в продуктовій таблиці');
          } else {
            resolve();
          }
        });
      }));
    });

    Promise.all(updateProductQueries)
      .then(() => {
        db.query('DELETE FROM order_items WHERE order_id = ?', [orderId], (err) => {
          if (err) {
            console.error('Помилка при видаленні елементів замовлення:', err);
            return res.status(500).json({ success: false, message: 'Помилка при видаленні елементів замовлення.' });
          }

          db.query('DELETE FROM orders WHERE order_id = ?', [orderId], (err, result) => {
            if (err) {
              console.error('Помилка при видаленні замовлення:', err);
              return res.status(500).json({ success: false, message: 'Помилка при видаленні замовлення.' });
            }

            if (result.affectedRows === 0) {
              return res.status(404).json({ success: false, message: 'Замовлення не знайдено.' });
            }

            return res.json({ success: true, message: 'Замовлення успішно видалено.' });
          });
        });
      })
      .catch((err) => {
        console.error('Помилка при оновленні кількості товарів:', err);
        return res.status(500).json({ success: false, message: 'Помилка при оновленні кількості товарів.' });
      });
  });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
